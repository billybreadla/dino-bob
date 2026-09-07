#!/usr/bin/env python3
"""Hybrid mesh→storybook pets: keep TripoSR shading, match painted chroma.

Lab a/b quantile matching from painted_bak refs onto mesh turntable frames,
mild L lift toward painted, then aggressive paintify. Live names pet_*_0..5.webp.
"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageOps


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MESHY = os.path.join(ROOT, "tmp/pets_ai/meshy")
SPRITES = os.path.join(ROOT, "assets/sprites")
SIZE = 512

PETS = [
    ("pet_ptero", "ptero_tt_soft", "pet_ptero_3d"),
    ("pet_turtle", "turtle_tt_soft", "pet_turtle_3d"),
    ("pet_firefly", "firefly_tt_soft", "pet_firefly_3d"),
]


def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c: np.ndarray) -> np.ndarray:
    return np.where(
        c <= 0.0031308,
        c * 12.92,
        1.055 * np.power(np.clip(c, 0, None), 1 / 2.4) - 0.055,
    )


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    r, g, b = srgb_to_linear(rgb[..., 0]), srgb_to_linear(rgb[..., 1]), srgb_to_linear(rgb[..., 2])
    x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375
    y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750
    z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041
    x, y, z = x / 0.95047, y / 1.0, z / 1.08883

    def f(t):
        return np.where(t > 0.008856, np.cbrt(t), 7.787 * t + 16 / 116)

    fx, fy, fz = f(x), f(y), f(z)
    return np.stack([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)], axis=-1)


def lab_to_rgb(lab: np.ndarray) -> np.ndarray:
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    fy = (L + 16) / 116
    fx = fy + a / 500
    fz = fy - b / 200

    def finv(t):
        t3 = t ** 3
        return np.where(t3 > 0.008856, t3, (t - 16 / 116) / 7.787)

    x, y, z = finv(fx) * 0.95047, finv(fy), finv(fz) * 1.08883
    r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314
    g = x * -0.9692660 + y * 1.8760108 + z * 0.0415560
    b = x * 0.0556434 + y * -0.2040259 + z * 1.0572252
    return np.clip(np.stack([linear_to_srgb(r), linear_to_srgb(g), linear_to_srgb(b)], axis=-1), 0, 1)


def paintify(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    rgb = im.convert("RGB")
    rgb = ImageOps.posterize(rgb, 5)
    rgb = rgb.filter(ImageFilter.SMOOTH_MORE)
    rgb = rgb.filter(ImageFilter.SMOOTH)
    rgb = ImageEnhance.Color(rgb).enhance(1.32)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.14)
    rgb = ImageEnhance.Brightness(rgb).enhance(1.03)
    out = rgb.convert("RGBA")
    a = im.split()[-1]
    out.putalpha(a)
    edge = ImageChops.difference(a.filter(ImageFilter.MaxFilter(5)), a)
    edge = edge.point(lambda v: 185 if v > 12 else 0).filter(ImageFilter.SMOOTH)
    ink = Image.new("RGBA", im.size, (42, 30, 24, 0))
    ink.putalpha(edge)
    return Image.alpha_composite(out, ink)


def fit_square(im: Image.Image, size: int = SIZE) -> Image.Image:
    im = im.convert("RGBA")
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    pad = int(size * 0.88)
    im.thumbnail((pad, pad), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    return canvas


def collect_painted_lab(live_prefix: str) -> np.ndarray:
    """Opaque Lab samples from painted_bak frames (prefer frame 0 heavy)."""
    bak = os.path.join(MESHY, "painted_bak")
    samples = []
    weights = []
    for i in range(4):
        p = os.path.join(bak, f"{live_prefix}_{i}.webp")
        if not os.path.exists(p):
            continue
        a = np.array(fit_square(Image.open(p), SIZE)).astype(np.float32) / 255.0
        m = a[..., 3] > 0.15
        lab = rgb_to_lab(a[..., :3])[m]
        w = 3.0 if i == 0 else 1.0
        # upsample weight by repeating
        n = max(1, int(round(w)))
        for _ in range(n):
            samples.append(lab)
        weights.append(w)
    return np.concatenate(samples, axis=0)


def quantile_match_channel(src: np.ndarray, ref: np.ndarray, n: int = 64) -> np.ndarray:
    """Map src values so their CDF matches ref CDF."""
    src = src.astype(np.float64)
    qs = np.linspace(0, 1, n)
    src_q = np.quantile(src, qs)
    ref_q = np.quantile(ref, qs)
    # ensure strictly increasing for interp
    for arr in (src_q, ref_q):
        for i in range(1, len(arr)):
            if arr[i] <= arr[i - 1]:
                arr[i] = arr[i - 1] + 1e-6
    return np.interp(src, src_q, ref_q).astype(np.float32)


def color_transfer(mesh: Image.Image, painted_lab: np.ndarray) -> Image.Image:
    m = np.array(mesh.convert("RGBA")).astype(np.float32) / 255.0
    mm = m[..., 3] > 0.08
    lab = rgb_to_lab(m[..., :3])
    src = lab[mm]
    ref = painted_lab

    out = lab.copy()
    # Keep most mesh L (shading); mild L quantile match for painted value range
    L_matched = quantile_match_channel(src[:, 0], ref[:, 0])
    out_L = src[:, 0] * 0.72 + L_matched * 0.28
    out_a = quantile_match_channel(src[:, 1], ref[:, 1])
    out_b = quantile_match_channel(src[:, 2], ref[:, 2])
    # Chroma expand around painted mean
    pa, pb = float(ref[:, 1].mean()), float(ref[:, 2].mean())
    out_a = pa + (out_a - pa) * 1.18
    out_b = pb + (out_b - pb) * 1.18

    out_flat = np.stack([out_L, out_a, out_b], axis=-1)
    out[mm] = out_flat
    rgb = lab_to_rgb(out)

    # Soft shade reinforce from original mesh luma (keep folds)
    y = 0.2126 * m[..., 0] + 0.7152 * m[..., 1] + 0.0722 * m[..., 2]
    y_mean = float(y[mm].mean()) + 1e-5
    shade = np.clip(y / y_mean, 0.55, 1.35)
    shade = 0.62 + 0.38 * shade
    rgb = np.clip(rgb * shade[..., None], 0, 1)

    result = np.zeros_like(m)
    result[..., :3] = rgb
    result[..., 3] = m[..., 3]
    result[~mm] = 0
    return Image.fromarray((result * 255).astype(np.uint8), "RGBA")


def process_pet(live_prefix: str, tt_dir: str, tt_prefix: str) -> list[str]:
    painted_lab = collect_painted_lab(live_prefix)
    wrote = []
    src_dir = os.path.join(MESHY, tt_dir)
    for i in range(6):
        src = os.path.join(src_dir, f"{tt_prefix}_{i}.png")
        mesh = fit_square(Image.open(src), SIZE)
        hybrid = color_transfer(mesh, painted_lab)
        # Kill TripoSR clay ridges before posterize
        rgb = hybrid.convert("RGB").filter(ImageFilter.GaussianBlur(radius=1.1))
        rgb = rgb.filter(ImageFilter.SMOOTH_MORE)
        soft = rgb.convert("RGBA")
        soft.putalpha(hybrid.split()[-1])
        hybrid = soft
        hybrid = paintify(hybrid)
        hybrid.putalpha(mesh.split()[-1])
        # re-apply soft outline after alpha restore
        a = hybrid.split()[-1]
        edge = ImageChops.difference(a.filter(ImageFilter.MaxFilter(5)), a)
        edge = edge.point(lambda v: 185 if v > 12 else 0).filter(ImageFilter.SMOOTH)
        ink = Image.new("RGBA", hybrid.size, (42, 30, 24, 0))
        ink.putalpha(edge)
        hybrid = Image.alpha_composite(hybrid, ink)
        out = os.path.join(SPRITES, f"{live_prefix}_{i}.webp")
        hybrid.save(out, "WEBP", quality=92, method=6)
        hybrid.save(os.path.join(SPRITES, f"{tt_prefix}_{i}.webp"), "WEBP", quality=92, method=6)
        print("wrote", out)
        wrote.append(out)
    return wrote


def contact_sheet(paths_by_pet: dict[str, list[str]], out_path: str) -> None:
    cell = 256
    labels = list(paths_by_pet.keys())
    cols = max(len(v) for v in paths_by_pet.values())
    sheet = Image.new("RGB", (cols * cell, len(labels) * cell), (18, 18, 22))
    for r, prefix in enumerate(labels):
        for c, p in enumerate(paths_by_pet[prefix]):
            im = Image.open(p).convert("RGBA").resize((cell, cell), Image.LANCZOS)
            bg = Image.new("RGBA", (cell, cell), (18, 18, 22, 255))
            bg.alpha_composite(im)
            sheet.paste(bg.convert("RGB"), (c * cell, r * cell))
    sheet.save(out_path)
    print("contact", out_path, sheet.size)


def main() -> int:
    paths = {}
    for live, tt_dir, tt_prefix in PETS:
        paths[live] = process_pet(live, tt_dir, tt_prefix)
    contact_sheet(paths, os.path.join(MESHY, "contact_pets_v52.png"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
