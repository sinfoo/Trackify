"""Render the Trackify wordmark (Arial Black, amber dot on the i) to assets/wordmark.png.

Usage: python make-wordmark.py
Re-run only if the wordmark styling changes; build-deck.mjs consumes the PNG.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent / "assets" / "wordmark.png"
FONT = Path(r"C:\Windows\Fonts\ariblk.ttf")
SIZE = 420
WHITE = (243, 245, 249, 255)
AMBER = (245, 166, 35, 255)

font = ImageFont.truetype(str(FONT), SIZE)
text = "Track\u0131fy"  # dotless i; the dot is drawn as an amber circle
pad = 40
x0, y0, x1, y1 = font.getbbox(text)
img = Image.new("RGBA", (x1 - x0 + 2 * pad, y1 - y0 + 2 * pad + 60), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
origin = (pad - x0, pad + 60 - y0)
draw.text(origin, text, font=font, fill=WHITE)

# Locate the stem of the dotless i and place the dot above it.
stem_left = origin[0] + font.getlength("Track")
adv = font.getlength("\u0131")
cap_top = font.getbbox("T")[1]
cx = stem_left + adv / 2
r = adv * 0.29  # a touch larger than the font's own dot, still clear of the stem
cy = origin[1] + cap_top + r - 10
draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=AMBER)

OUT.parent.mkdir(parents=True, exist_ok=True)
img = img.crop(img.getbbox())
img.save(OUT)
print(OUT, img.size)
