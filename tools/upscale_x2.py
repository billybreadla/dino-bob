#!/usr/bin/env python3
"""2x super-resolution upscaler for game art (reusable).

Upscales an image 2x with REAL super-resolution (EDSR via OpenCV
dnn_superres — detail-preserving, not plain interpolation), then saves as
WebP. Each channel (incl. alpha) is upscaled separately so RGBA survives.
If no SR model can be loaded, falls back to Lanczos + UnsharpMask and says
so on stdout.

Usage:
    python3 tools/upscale_x2.py IMAGE [IMAGE ...] [--model PATH]
                                  [--quality N] [--out PATH | --suffix S]

Default writes over each input file IN PLACE. Model: EDSR_x2.pb from
https://github.com/Saafke/EDSR_Tensorflow (~38MB; FSRCNN_x2.pb tiny alt).
"""
import argparse
import os

from PIL import Image, ImageFilter

SCALE = 2


def model_dir():
    return os.path.join(os.environ.get("TMPDIR", "/tmp"), "opencode", "models")


def default_model():
    edsr = os.path.join(model_dir(), "EDSR_x2.pb")
    if os.path.exists(edsr):
        return edsr
    fsrcnn = os.path.join(model_dir(), "FSRCNN_x2.pb")
    return fsrcnn if os.path.exists(fsrcnn) else None


def make_upsampler(model_path):
    """Return f(HxWx3 uint8) -> H*2 x W*2 x 3 uint8, plus arch name.
    EDSR/FSRCNN nets take exactly 3 input channels; callers pack channels."""
    import cv2
    from cv2 import dnn_superres

    sr = dnn_superres.DnnSuperResImpl_create()
    sr.readModel(model_path)
    base = os.path.basename(model_path).lower()
    arch = "fsrcnn" if "fsrcnn" in base else "edsr"
    sr.setModel(arch, SCALE)
    return sr.upsample, arch


def fallback_lanczos(arr3):
    """Plain Lanczos + mild unsharp on an HxWx3 array — last resort only."""
    img = Image.fromarray(arr3)
    up = img.resize((img.width * SCALE, img.height * SCALE), Image.LANCZOS)
    up = up.filter(ImageFilter.UnsharpMask(radius=2, percent=110, threshold=2))
    return __import__("numpy").asarray(up)


def upscale_file(path, upsampler, quality, out_path=None):
    """Pack image channels into 3-channel net inputs (RGB together; any extra
    channels like alpha replicated x3, first plane kept), unpack after."""
    import numpy as np

    img = Image.open(path)
    orig_kb = os.path.getsize(path) // 1024
    chans = [np.asarray(c, dtype="uint8") for c in img.split()]
    up_chans = []
    for i in range(0, len(chans), 3):
        group = chans[i : i + 3]
        while len(group) < 3:
            group.append(group[-1])  # e.g. lone alpha -> A,A,A
        packed = np.stack(group, axis=2)
        out = upsampler(packed)
        n = len(group if len(chans) - i >= 3 else chans[i:])
        up_chans.extend([out[:, :, k] for k in range(n)])
    up = Image.merge(img.mode, [Image.fromarray(c, mode="L") for c in up_chans])
    dest = out_path or path
    up.save(dest, quality=quality, method=6)
    print(
        f"  {os.path.basename(path)}: {img.size[0]}x{img.size[1]} -> "
        f"{up.size[0]}x{up.size[1]}  {orig_kb}KB -> {os.path.getsize(dest) // 1024}KB",
        flush=True,
    )


def main():
    ap = argparse.ArgumentParser(
        description="2x super-resolution upscale (EDSR) with WebP output."
    )
    ap.add_argument("images", nargs="+", help="input image(s); in place unless --out/--suffix")
    ap.add_argument("--quality", type=int, default=82, help="WebP quality (default 82)")
    ap.add_argument("--out", help="output path (single input only)")
    ap.add_argument("--suffix", default="", help="write <name><suffix>.webp instead of in place")
    args = ap.parse_args()

    model = default_model()
    if model is None:
        print("FALLBACK: no EDSR/FSRCNN model found — using Lanczos+UnsharpMask")
        upsampler, arch = fallback_lanczos, "Lanczos+Unsharp"
    else:
        upsampler, arch = make_upsampler(model)
        print(f"SR method: {arch.upper()} x2 ({model})")

    out_path = None
    if args.out:
        if len(args.images) > 1:
            ap.error("--out requires exactly one input image")
        out_path = args.out
    for i, path in enumerate(args.images):
        print(f"[{i + 1}/{len(args.images)}] {path}")
        dest = out_path
        if not dest and args.suffix:
            root, _ = os.path.splitext(path)
            dest = root + args.suffix + ".webp"
        upscale_file(path, upsampler, args.quality, dest)


if __name__ == "__main__":
    main()
