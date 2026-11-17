#!/usr/bin/env python3
"""Generate Android launcher icons and splash images for Nvisco Playz.

Re-run only if the logo changes:  python3 scripts/generate_assets.py
Needs Pillow (pip install pillow) and the DejaVu Sans Bold font (or pass FONT=/path/to.ttf).
Source art: ../public/brand/logo-white.png (white logo, transparent bg); app-icon-1024.png has the same layout.
"""
import os
import glob
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
MOBILE = os.path.dirname(HERE)
REPO = os.path.dirname(MOBILE)
RES = os.path.join(MOBILE, "android", "app", "src", "main", "res")
LOGO = Image.open(os.path.join(REPO, "public", "brand", "logo-white.png")).convert("RGBA")

# The source PNG has a faint alpha=1 haze around the mark (shows as a grey box on black): remove it.
_alpha = LOGO.getchannel("A").point(lambda v: 0 if v < 12 else v)
LOGO.putalpha(_alpha)

FONT_PATH = os.environ.get("FONT") or next(
    p for p in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    ] if os.path.exists(p)
)
TAGLINE = ["Promote your business", "with Nvisco Playz"]
DENSITIES = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)


def scaled_logo(width_px):
    h = round(LOGO.height * width_px / LOGO.width)
    return LOGO.resize((round(width_px), h), Image.LANCZOS)


# ---------------------------------------------------------------- launcher icons
def legacy_icon(size, shape):
    """Black tile with the logo at 73% width (same layout as public/brand/app-icon-1024.png)."""
    big = 4 * size
    tile = Image.new("RGBA", (big, big), (0, 0, 0, 255))
    logo = scaled_logo(big * 0.73)
    tile.alpha_composite(logo, ((big - logo.width) // 2, (big - logo.height) // 2))
    mask = Image.new("L", (big, big), 0)
    d = ImageDraw.Draw(mask)
    if shape == "round":
        d.ellipse((0, 0, big - 1, big - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, big - 1, big - 1), radius=round(big * 0.18), fill=255)
    tile.putalpha(mask)
    return tile.resize((size, size), Image.LANCZOS)


def adaptive_foreground(size):
    """108dp canvas, transparent; white logo = 62% of canvas width (inside 66dp safe zone)."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    logo = scaled_logo(size * 0.62)
    canvas.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    return canvas


for name, scale in DENSITIES.items():
    d = os.path.join(RES, f"mipmap-{name}")
    save(legacy_icon(round(48 * scale), "square"), os.path.join(d, "ic_launcher.png"))
    save(legacy_icon(round(48 * scale), "round"), os.path.join(d, "ic_launcher_round.png"))
    save(adaptive_foreground(round(108 * scale)), os.path.join(d, "ic_launcher_foreground.png"))


# ---------------------------------------------------------------- splash images
def text_block(lines, font_px, color=(255, 255, 255, 255)):
    font = ImageFont.truetype(FONT_PATH, font_px)
    line_h = round(font_px * 1.3)
    widths = [round(font.getlength(t)) for t in lines]
    img = Image.new("RGBA", (max(widths), line_h * len(lines)), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, t in enumerate(lines):
        d.text(((img.width - widths[i]) // 2, i * line_h), t, font=font, fill=color)
    return img


def compose(canvas_w, canvas_h, logo_w, font_px, gap, lines):
    """Transparent canvas with logo + tagline block, vertically centred as a group."""
    logo = scaled_logo(logo_w)
    text = text_block(lines, font_px)
    total = logo.height + gap + text.height
    top = (canvas_h - total) // 2
    img = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    img.alpha_composite(logo, ((canvas_w - logo.width) // 2, top))
    img.alpha_composite(text, ((canvas_w - text.width) // 2, top + logo.height + gap))
    return img


# (a) drawable/splash.xml uses splash_logo.png centred on black (any screen shape, no stretching).
#     Canvas 300 x 200 dp; logo 216dp wide (= 60% of a 360dp-wide phone), tagline 18dp, 2 lines.
# (b) splash_icon.png is the Android 12+ system-splash icon: 288dp canvas, but only the middle
#     192dp circle is visible, so logo is 140dp wide and the tagline is 3 short lines at 14dp.
for name, s in DENSITIES.items():
    save(compose(round(300 * s), round(200 * s), round(216 * s), round(18 * s), round(18 * s), TAGLINE),
         os.path.join(RES, f"drawable-{name}", "splash_logo.png"))
    save(compose(round(288 * s), round(288 * s), round(140 * s), round(14 * s), round(10 * s),
                 ["Promote your", "business with", "Nvisco Playz"]),
         os.path.join(RES, f"drawable-{name}", "splash_icon.png"))

# remove Capacitor default splash.png / old placeholder artwork
for f in glob.glob(os.path.join(RES, "drawable*", "splash.png")):
    os.remove(f)
print("assets generated with font", FONT_PATH)
