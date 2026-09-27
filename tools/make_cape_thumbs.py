from pathlib import Path
from PIL import Image

src = Path(__file__).resolve().parents[1] / "public" / "capes"
dst = src / "thumbs"
dst.mkdir(exist_ok=True)
frames = {"astra": 8, "cross": 24, "astraclient": 12, "aura": 24}

for png in sorted(src.glob("*.png")):
    im = Image.open(png).convert("RGBA")
    n = frames.get(png.stem, 1)
    fh = im.height // n
    unit_u = im.width / 64
    unit_v = fh / 32
    box = (
        int(round(1 * unit_u)),
        int(round(1 * unit_v)),
        int(round(11 * unit_u)),
        int(round(17 * unit_v)),
    )
    face = im.crop(box).resize((160, 256), Image.NEAREST)
    out = dst / png.name
    face.save(out, optimize=True)
    print(f"{png.name} {im.size} -> {face.size} {out.stat().st_size}")

print("done", len(list(dst.glob("*.png"))))
