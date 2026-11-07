"""Extract official CARPEO logos from the brand PDF and save photo placeholders."""
from __future__ import annotations

import io
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(r"C:\Users\AYOUB\Desktop\carpeo")
EXTRACT = ROOT / "assets" / "extract"
OUT = ROOT / "assets" / "img"
OUT.mkdir(parents=True, exist_ok=True)


def knock_black(src: Path) -> Image.Image:
    im = Image.open(src).convert("RGBA")
    arr = np.array(im)
    mx = arr[:, :, :3].max(axis=2)
    arr[:, :, 3] = np.where(mx < 12, 0, 255).astype(np.uint8)
    rgba = Image.fromarray(arr, "RGBA")
    bbox = rgba.getchannel("A").getbbox()
    return rgba.crop(bbox) if bbox else rgba


def to_white(src: Path) -> Image.Image:
    im = Image.open(src).convert("RGBA")
    arr = np.array(im)
    mx = arr[:, :, :3].max(axis=2)
    out = np.zeros_like(arr)
    out[:, :, 0] = 255
    out[:, :, 1] = 255
    out[:, :, 2] = 255
    out[:, :, 3] = np.where(mx < 12, 0, mx).astype(np.uint8)
    rgba = Image.fromarray(out, "RGBA")
    bbox = rgba.getchannel("A").getbbox()
    return rgba.crop(bbox) if bbox else rgba


def save(im: Image.Image, name: str) -> None:
    path = OUT / name
    im.save(path, "PNG", optimize=True)
    print(name, im.size)


def main() -> None:
    symbol = knock_black(EXTRACT / "p1_X33_505x435.png")
    compact = knock_black(EXTRACT / "p3_X120_985x717.png")
    full = knock_black(EXTRACT / "p0_X22_985x980.png")
    white = to_white(EXTRACT / "p3_X124_985x717.png")
    save(symbol, "logo-symbol.png")
    save(compact, "logo-compact.png")
    save(full, "logo-full.png")
    save(white, "logo-white.png")
    symbol.resize((64, 64), Image.Resampling.LANCZOS).save(ROOT / "favicon.png", "PNG")

    photos = {
        "hero-salon.webp": "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1600&q=75",
        "canape.webp": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1400&q=75",
        "canape-clair.webp": "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=1400&q=75",
        "tissu.webp": "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=75",
        "matelas.webp": "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1400&q=75",
        "tapis.webp": "https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&w=1400&q=75",
        "fauteuil.webp": "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=1200&q=75",
        "interieur.webp": "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1400&q=75",
        "chaise.webp": "https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?auto=format&fit=crop&w=1200&q=75",
    }
    opener = urllib.request.build_opener()
    opener.addheaders = [("User-Agent", "CARPEO-site-build/1.0")]
    for name, url in photos.items():
        dest = OUT / name
        try:
            with opener.open(url, timeout=40) as res:
                data = res.read()
            img = Image.open(io.BytesIO(data)).convert("RGB")
            img.thumbnail((1600, 1200), Image.Resampling.LANCZOS)
            img.save(dest, "WEBP", quality=78, method=6)
            print(name, img.size, dest.stat().st_size)
        except Exception as exc:
            print("FAIL", name, type(exc).__name__, exc)


if __name__ == "__main__":
    main()
