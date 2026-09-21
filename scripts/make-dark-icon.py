"""Generate macOS dark mode icons for DSH-X conforming to Apple HIG.

Produces:
    assets/icon-dark.png
    assets/AppIcon-dark.icns
    public/icon-dark.png
"""

import os
import sys
import subprocess
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
PUBLIC = os.path.join(ROOT, "public")
SOURCE_CONCEPT = "/Users/yy/.gemini/antigravity/brain/ecfe94c5-f8ca-4965-87a2-107d64a612c1/dsh_dark_icon_concept_1789996428107.jpg"

def create_squircle_mask(size, radius):
    mask = Image.new("L", (size * 2, size * 2), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), (size * 2 - 1, size * 2 - 1)], radius=radius * 2, fill=255)
    return mask.resize((size, size), Image.Resampling.LANCZOS)

def main():
    os.makedirs(ASSETS, exist_ok=True)
    os.makedirs(PUBLIC, exist_ok=True)

    tile_size = 824
    canvas_size = 1024
    radius = int(tile_size * 0.224)

    # Load high-resolution artwork
    if os.path.exists(SOURCE_CONCEPT):
        src = Image.open(SOURCE_CONCEPT).convert("RGBA")
    else:
        src = Image.open(os.path.join(ASSETS, "icon.png")).convert("RGBA")

    # Resize squircle tile
    tile = src.resize((tile_size, tile_size), Image.Resampling.LANCZOS)

    # Add subtle Apple dark mode metallic/glass inner bezel
    bezel = Image.new("RGBA", (tile_size * 2, tile_size * 2), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(bezel)
    b_draw.rounded_rectangle(
        [(1, 1), (tile_size * 2 - 2, tile_size * 2 - 2)],
        radius=radius * 2,
        outline=(255, 255, 255, 38),
        width=2
    )
    bezel_scaled = bezel.resize((tile_size, tile_size), Image.Resampling.LANCZOS)
    tile.alpha_composite(bezel_scaled)

    # Apply squircle mask
    s_mask = create_squircle_mask(tile_size, radius)
    tile.putalpha(s_mask)

    # Save square master icon (without canvas padding)
    tile.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(ASSETS, "icon-dark.png"))
    tile.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(PUBLIC, "icon-dark.png"))

    # Assemble on 1024x1024 macOS canvas with soft ambient shadow
    offset_x = (canvas_size - tile_size) // 2
    offset_y = (canvas_size - tile_size) // 2 + 10
    shadow = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.rounded_rectangle(
        [(offset_x, offset_y + 12), (offset_x + tile_size - 1, offset_y + 12 + tile_size - 1)],
        radius=radius,
        fill=(0, 0, 0, 160)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    canvas.alpha_composite(shadow)
    canvas.paste(tile, (offset_x, offset_y), tile)

    # Build iconset
    iconset_dir = os.path.join(ROOT, "release", "AppIcon-dark.iconset")
    os.makedirs(iconset_dir, exist_ok=True)

    sizes = [
        (16, "icon_16x16.png"),
        (32, "icon_16x16@2x.png"),
        (32, "icon_32x32.png"),
        (64, "icon_32x32@2x.png"),
        (128, "icon_128x128.png"),
        (256, "icon_128x128@2x.png"),
        (256, "icon_256x256.png"),
        (512, "icon_256x256@2x.png"),
        (512, "icon_512x512.png"),
        (1024, "icon_512x512@2x.png"),
    ]

    for sz, name in sizes:
        canvas.resize((sz, sz), Image.Resampling.LANCZOS).save(os.path.join(iconset_dir, name))

    out_icns = os.path.join(ASSETS, "AppIcon-dark.icns")
    subprocess.run(["iconutil", "-c", "icns", iconset_dir, "-o", out_icns], check=True)
    subprocess.run(["rm", "-rf", iconset_dir], check=True)

    print(f"Generated {out_icns} ({os.path.getsize(out_icns)} bytes)")
    print(f"Generated {os.path.join(ASSETS, 'icon-dark.png')}")

if __name__ == "__main__":
    main()
