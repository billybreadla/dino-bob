#!/usr/bin/env python3
"""Slice each 1600x900 biome painting (assets/sprites/bg_<biome>.webp) into two
parallax planes, ported from "if penguins could fly" tools/slice_bg0.py:

  far = the full painting, wrapseam'd so horizontally-tiled copies meet soft
        (drawn static-ish; it already contains every element)
  mid = a full-height frame whose alpha keeps only the band's mid-ground
        elements (per-biome colour cutout, blurred), so the far layer shows
        through the gaps and the mid can drift/sway over its own ghost

These paintings are atmospherically graded (blue-shifted pines, orange-lit
palms), so the penguins' plain green-dominance rule doesn't transfer — each
biome gets its own predicate, eyeballed via tmp/preview_<biome>.png (far + mid
offset 30px to expose the cutout). Biomes whose cutout previews broken stay
single-plane in game.js. Re-run:  python3 tools/slice_bg.py [biome ...]
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

SRC_DIR = "assets/sprites"
OUT_DIR = "assets/sprites"
PREV_DIR = "tmp"

# biome -> (band top, band bottom, predicate(r, g, b) -> bool mask).
# Bands/predicates tuned per painting from channel samples.
BIOMES = {
    # blue-shifted pines + cliff greenery vs grey rock / bright mist
    "mountain": (0.26, 0.88, lambda r, g, b: (g > r + 25) & (b > r + 25)),
    # dark palm/fern silhouettes against the bright sunset
    "sunset_beach": (0.00, 1.00, lambda r, g, b: np.maximum(np.maximum(r, g), b) < 95),
    # green-tinted mossy islands vs the deep blue night sky
    "starlight": (0.10, 0.96, lambda r, g, b: (g > r + 8) & (np.maximum(np.maximum(r, g), b) < 115)),
    # classic green-dominant kelp vs blue water
    "underwater": (0.02, 0.98, lambda r, g, b: (g > b + 8) & (g > r + 10)),
    # dense uniform forest — no separable plane; kept for the record, skipped in game
    "meadow": (0.05, 0.75, lambda r, g, b: (g >= r + 2) & (g >= b + 2)),
}


def vfeather(y0, y1, hsrc, f0, f1):
    """Alpha ramp 0->1 across the band's top f0..f1 (fractions of source height)."""
    a = np.ones(y1 - y0, dtype=np.float32)
    t0 = max(0, int(f0 * hsrc) - y0)
    t1 = max(0, int(f1 * hsrc) - y0)
    a[:t0] = 0.0
    if t1 > t0:
        a[t0:t1] = np.linspace(0, 1, t1 - t0)
    b1 = (y1 - y0) - max(0, int(f1 * hsrc) - y1)  # symmetric feather at band bottom
    b0 = (y1 - y0) - max(0, int(f1 * hsrc) - y0)
    a[b1:] = 0.0
    if b1 > b0:
        a[b0:b1] = np.linspace(1, 0, b1 - b0)
    return a


def wrapseam(img, f=None):
    """Blend the band's last columns over its first so tiled copies crossfade."""
    w, h = img.size
    if f is None:
        # all lengths scale off source size (24px/5% tuned at 1600x900)
        f = max(24 * w // 1600, int(w * 0.05))
    end = img.crop((w - f, 0, w, h))
    ramp = np.tile(np.linspace(255, 0, f), (h, 1)).astype(np.uint8)
    img.paste(end, (0, 0), Image.fromarray(ramp))
    return img


def slice_biome(biome, ftop, fbot, pred):
    src = Image.open(f"{SRC_DIR}/bg_{biome}.webp").convert("RGB")
    w, h = src.size
    px = np.asarray(src).astype(np.int16)
    r, g, b = px[:, :, 0], px[:, :, 1], px[:, :, 2]

    far = src.convert("RGBA")
    wrapseam(far)
    far.save(f"{OUT_DIR}/bg_{biome}_far.webp", quality=85, method=6)

    y0, y1 = int(ftop * h), int(fbot * h)
    keep = pred(r, g, b).astype(np.uint8) * 255
    mask_blur = max(3, round(3 * h / 900))  # was 3px at 900p; scale with height
    keep = np.asarray(Image.fromarray(keep).filter(ImageFilter.GaussianBlur(mask_blur)))
    alpha = np.zeros((h, w), dtype=np.uint8)
    band_a = (vfeather(y0, y1, h, ftop, ftop + 0.05) * 255).astype(np.uint8)
    alpha[y0:y1, :] = (
        (band_a[:, None].astype(np.int32) * keep[y0:y1, :].astype(np.int32)) // 255
    ).astype(np.uint8)  # int32: uint8*uint8 wraps mod 256 -> all-zero alpha
    mid = src.convert("RGBA")
    mid.putalpha(Image.fromarray(alpha))
    wrapseam(mid)
    mid.save(f"{OUT_DIR}/bg_{biome}_mid.webp", quality=85, method=6)

    cov = (alpha[y0:y1] > 40).mean()
    print(f"bg_{biome}: mid band rows {y0}-{y1}, cutout coverage {cov:.0%}")

    prev = far.copy()
    prev.alpha_composite(mid, (max(30, 30 * w // 1600), 0))  # exaggerated drift to expose the cutout
    prev.convert("RGB").save(f"{PREV_DIR}/preview_{biome}.png")
    return cov


def main():
    want = sys.argv[1:]
    for biome, (ftop, fbot, pred) in BIOMES.items():
        if want and biome not in want:
            continue
        slice_biome(biome, ftop, fbot, pred)
    print(f"previews in {PREV_DIR}/ — eyeball each before shipping")


if __name__ == "__main__":
    main()
