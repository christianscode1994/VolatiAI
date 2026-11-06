#!/usr/bin/env python3
"""VolatiAI futuristic logo: radial gradient, multi-layer glow, scanlines, pulse rings."""
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
from pathlib import Path

S = 1024
OUT = Path("docs")
OUT.mkdir(exist_ok=True)

BG_INNER  = (28, 34, 46, 255)
BG_OUTER  = (6, 8, 12, 255)
AMBER     = (212, 160, 23, 255)
AMBER_HOT = (255, 204, 51, 255)
BLUE      = (106, 154, 239, 255)
BLUE_HOT  = (140, 190, 255, 255)

def radial_gradient(size, inner, outer):
    """Center-bright radial gradient."""
    try:
        mask = Image.radial_gradient("L").resize((size, size), Image.LANCZOS)
    except Exception:
        # Fallback: manual radial via concentric circles
        mask = Image.new("L", (size, size), 0)
        d = ImageDraw.Draw(mask)
        cx, cy = size // 2, size // 2
        maxr = int(size * 0.7)
        for r in range(maxr, 0, -2):
            shade = int(255 * (r / maxr))
            d.ellipse([(cx-r, cy-r), (cx+r, cy+r)], fill=shade)
    mask = Image.eval(mask, lambda x: 255 - x)
    inner_img = Image.new("RGBA", (size, size), inner)
    outer_img = Image.new("RGBA", (size, size), outer)
    return Image.composite(inner_img, outer_img, mask)

def v_layer(size, color, width=56):
    layer = Image.new("RGBA", (size, size), (0,0,0,0))
    d = ImageDraw.Draw(layer)
    pts = [(224, 224), (512, 768), (800, 224)]
    for (x1,y1),(x2,y2) in [(pts[0],pts[1]),(pts[1],pts[2])]:
        d.line([(x1,y1),(x2,y2)], fill=color, width=width)
    r = width // 2
    for (cx,cy) in pts:
        d.ellipse([(cx-r,cy-r),(cx+r,cy+r)], fill=color)
    return layer

def render(size):
    # Rounded-square mask
    mask = Image.new("L", (S,S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([(0,0),(S,S)], radius=192, fill=255)

    # Background
    canvas = radial_gradient(S, BG_INNER, BG_OUTER)

    # Grid
    grid = Image.new("RGBA", (S,S), (0,0,0,0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, S, 96):
        gd.line([(x,0),(x,S)], fill=(106,154,239,8))
    for y in range(0, S, 96):
        gd.line([(0,y),(S,y)], fill=(106,154,239,8))
    canvas = Image.alpha_composite(canvas, grid)

    # V with 3-layer glow
    v_solid = v_layer(S, AMBER)
    glow_wide   = v_solid.filter(ImageFilter.GaussianBlur(56))
    glow_medium = v_solid.filter(ImageFilter.GaussianBlur(24))
    glow_tight  = v_solid.filter(ImageFilter.GaussianBlur(8))
    glow_wide   = ImageEnhance.Brightness(glow_wide).enhance(1.3)
    glow_medium = ImageEnhance.Brightness(glow_medium).enhance(1.4)

    canvas = Image.alpha_composite(canvas, glow_wide)
    canvas = Image.alpha_composite(canvas, glow_medium)
    canvas = Image.alpha_composite(canvas, glow_tight)
    canvas = Image.alpha_composite(canvas, v_solid)

    # Crystalline highlight edge
    hot = v_layer(S, AMBER_HOT, width=10)
    canvas = Image.alpha_composite(canvas, hot)

    # Signal dot with concentric rings
    dot = Image.new("RGBA", (S,S), (0,0,0,0))
    dd = ImageDraw.Draw(dot)
    cx, cy = 512, 224
    for r, alpha in [(96, 25), (72, 55), (48, 105), (30, 255)]:
        color = BLUE_HOT if alpha == 255 else (*BLUE_HOT[:3], alpha)
        dd.ellipse([(cx-r,cy-r),(cx+r,cy+r)], fill=color)
    canvas = Image.alpha_composite(canvas, dot)

    # Scanlines
    scan = Image.new("RGBA", (S,S), (0,0,0,0))
    sd = ImageDraw.Draw(scan)
    for y in range(0, S, 4):
        sd.line([(0,y),(S,y)], fill=(255,255,255,12))
    canvas = Image.alpha_composite(canvas, scan)

    # Rounded corners
    final = Image.new("RGBA", (S,S), (0,0,0,0))
    final.paste(canvas, (0,0), mask)

    return final.resize((size, size), Image.LANCZOS)

for sz in [1024, 512, 400, 256, 128]:
    p = OUT / f"logo-{sz}.png"
    render(sz).save(p, optimize=True)
    print(f"  {p} ({p.stat().st_size:,} bytes)")
print("done")
