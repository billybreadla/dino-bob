#!/usr/bin/env python3
"""Post-pass for the title render: dusk gradient + vignette + warm cast.

    python3 tools/title_post.py <title_scene.png> [out.png]
"""
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else src.replace('.png', '_final.png')
    im = Image.open(src).convert('RGB')
    W, H = im.size
    # violet dusk veil: strongest at the top, gone by ~62% down
    grad = Image.new('L', (1, H))
    for y in range(H):
        f = y / H
        grad.putpixel((0, y), int(max(0.0, 1.0 - f / 0.62) * 235))
    grad = grad.resize((W, H))
    violet = Image.new('RGB', (W, H), '#3d2a5e')
    im = Image.composite(violet, im, grad)
    # gentle vignette
    vig = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(vig)
    d.ellipse([-W * 0.25, -H * 0.35, W * 1.25, H * 1.35], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(120))
    dark = ImageEnhance.Brightness(im).enhance(0.82)
    im = Image.composite(im, dark, vig)
    im = ImageEnhance.Color(im).enhance(1.12)
    im.save(out)
    print('post-processed', out)


if __name__ == '__main__':
    main()
