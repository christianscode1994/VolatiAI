#!/usr/bin/env python3
"""VolatiAI futuristic logo: radial gradient, glow, scanlines, pulse rings."""
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
from pathlib import Path
import math

S = 1024  # master resolution
OUT = Path("docs")
OUT.mkdir(exist_ok=True)

# Palette
BG_INNER   = (24, 28, 38, 255)   # #181c26
BG_OUTER   = (5, 6, 8, 255)      # #050608
AMBER      = (212, 160, 23, 255) # #d4a017
AMBER_HOT  = (255, 204, 51, 255) # #ffcc33
BLUE       = (106, 154, 239, 255)
BLUE_HOT   = (140, 190, 255, 255)

def radial_gradient(size, inner, outer):
    """Center-bright radial gradient."""
    mask = Image.radial_gradient("L").resize((size, size), Image.LANCZOS)
    mask = Image.eval(mask, lambda x: 255 - x)  # invert → center bright
    inner_img = Image.new("RGBA", (size, size), inner)
    outer_img = Image.new("RGBA", (size, size), outer)
    return Image.composite(inner_img, outer_img, mask)

def v_layer(size, color, width=56):
    """V shape with round caps at master resolution."""
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
    # 1. Rounded-square mask (applied at the very end)
    mask = Image.new("L", (S,S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([(0,0),(S,S)], radius=192, fill=255)

    # 2. Background radial gradient
    canvas = radial_gradient(S, BG_INNER, BG_OUTER)

    # 3. Subtle grid (futuristic texture)
    grid = Image.new("RGBA", (S,S), (0,0,0,0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, S, 96):
        gd.line([(x,0),(x,S)], fill=(106,154,239,6))
    for y in range(0, S, 96):
        gd.line([(0,y),(S,y)], fill=(106,154,239,6))
    canvas = Image.alpha_composite(canvas, grid)

    # 4. V glow layers (3 passes: wide, medium, tight)
    v_solid = v_layer(S, AMBER)
    glow_wide   = v_solid.filter(ImageFilter.GaussianBlur(radius=56))
    glow_medium = v_solid.filter(ImageFilter.GaussianBlur(radius=28))
    glow_tight  = v_solid.filter(ImageFilter.GaussianBlur(radius=10))
    # Boost glow alpha slightly for richer effect
    glow_wide   = ImageEnhance.Brightness(glow_wide).enhance(1.2)
    glow_medium = ImageEnhance.Brightness(glow_medium).enhance(1.3)

    canvas = Image.alpha_composite(canvas, glow_wide)
    canvas = Image.alpha_composite(canvas, glow_medium)
    canvas = Image.alpha_composite(canvas, glow_tight)
    canvas = Image.alpha_composite(canvas, v_solid)

    # 5. V highlight edge (thin bright amber_hot line for crystalline look)
    hot = v_layer(S, AMBER_HOT, width=12)
    canvas = Image.alpha_composite(canvas, hot)

    # 6. Signal dot: hot blue center + concentric pulse rings
    dot = Image.new("RGBA", (S,S), (0,0,0,0))
    dd = ImageDraw.Draw(dot)
    cx, cy = 512, 224
    # 3 concentric rings fading outward (implies pulse even when static)
    for i, (r, alpha) in enumerate([(96, 30), (72, 60), (48, 100), (32, 255)]):
        color = BLUE_HOT if i == 3 else (*BLUE_HOT[:3], alpha)
        dd.ellipse([(cx-r,cy-r),(cx+r,cy+r)], fill=color)
    canvas = Image.alpha_composite(canvas, dot)

    # 7. Scanlines (subtle CRT feel)
    scan = Image.new("RGBA", (S,S), (0,0,0,0))
    sd = ImageDraw.Draw(scan)
    for y in range(0, S, 4):
        sd.line([(0,y),(S,y)], fill=(255,255,255,10))
    canvas = Image.alpha_composite(canvas, scan)

    # 8. Apply rounded-square mask
    final = Image.new("RGBA", (S,S), (0,0,0,0))
    final.paste(canvas, (0,0), mask)

    # 9. Downscale to target
    return final.resize((size, size), Image.LANCZOS)

for sz in [1024, 512, 400, 256, 128]:
    p = OUT / f"logo-{sz}.png"
    render(sz).save(p, optimize=True)
    print(f"  {p} ({p.stat().st_size:,} bytes)")
print("done")
