#!/usr/bin/env python3
"""Development-time generator for the synthetic demo receipts.

These images are invented for the demo: no real person's receipt is used, and
nothing private is committed. They exist so a judge can exercise the scanner
without having a receipt to hand. Regenerate with:

    python3 scripts/make-sample-receipts.py

Requires Pillow (BSD-like licence) and the DejaVu fonts; neither is a runtime
dependency of the app.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "sample-receipts")
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
MONO_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

def render(lines, path, width=860, scale=1.0, blur=0.0, noise=False, rotate=0.0):
    body = ImageFont.truetype(MONO, int(23 * scale))
    bold = ImageFont.truetype(MONO_BOLD, int(27 * scale))
    line_h = int(34 * scale)
    height = 80 + line_h * len(lines)
    img = Image.new("RGB", (int(width * scale), int(height)), "white")
    draw = ImageDraw.Draw(img)
    y = 36
    for text, kind in lines:
        font = bold if kind in ("head", "total") else body
        if kind == "rule":
            draw.line([(40, y + 12), (int(width * scale) - 40, y + 12)], fill=(90, 90, 90), width=2)
        elif kind == "head":
            w = draw.textlength(text, font=font)
            draw.text(((int(width * scale) - w) / 2, y), text, font=font, fill=(10, 10, 10))
        else:
            draw.text((44, y), text, font=font, fill=(20, 20, 20))
        y += line_h
    if rotate:
        img = img.rotate(rotate, expand=True, fillcolor="white")
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    if noise:
        img = img.point(lambda p: max(0, min(255, int(p * 0.82 + 26))))
    img.save(path, "PNG", optimize=True)
    print(f"wrote {path} ({os.path.getsize(path)} bytes)")


supermarket = [
    ("Meena Bazar", "head"),
    ("Dhanmondi Branch, Dhaka-1209", "line"),
    ("Tel: 09612-345678   BIN: 000123456-0101", "line"),
    ("CASH MEMO", "line"),
    ("Invoice No: 4417-2261", "line"),
    ("Date: 14/04/2026   Time: 19:24", "line"),
    ("", "rule"),
    ("Basmati Rice 5kg          1 x  850.00    850.00", "line"),
    ("Fresh Milk 1L             2 x  110.00    220.00", "line"),
    ("Farm Eggs (dozen)         1 x  160.00    160.00", "line"),
    ("Savlon Soap 100g          1 x   95.00     95.00", "line"),
    ("", "rule"),
    ("Sub Total                              1325.00", "line"),
    ("VAT 5%                                   66.25", "line"),
    ("Discount                                -50.00", "line"),
    ("GRAND TOTAL                            1341.25", "total"),
    ("Cash Received                          1500.00", "line"),
    ("Change                                  158.75", "line"),
    ("", "rule"),
    ("Thank you for shopping with us", "line"),
]

restaurant = [
    ("SULTANS DINE", "head"),
    ("Gulshan-1, Dhaka", "line"),
    ("Bill No 8821    Table 12", "line"),
    ("Date 17-04-2026  20:42", "line"),
    ("", "rule"),
    ("Kacchi Biriyani Full   2 x 650      1300", "line"),
    ("Borhani                2 x  60       120", "line"),
    ("Firni                  1 x 120       120", "line"),
    ("", "rule"),
    ("Sub Total                           1540", "line"),
    ("Service Charge 5%                     77", "line"),
    ("TOTAL PAYABLE                    1617 Tk", "total"),
    ("Paid by bKash", "line"),
]

faint = [
    ("Lazz Pharma", "head"),
    ("Mirpur 10, Dhaka", "line"),
    ("Memo 55120", "line"),
    ("Date 09/04/2026", "line"),
    ("", "rule"),
    ("Napa Extra 10s              45.00", "line"),
    ("Sergel 20mg 14s            210.00", "line"),
    ("Vitamin D3                 320.00", "line"),
    ("", "rule"),
    ("TOTAL                      575.00", "total"),
]

os.makedirs(OUT, exist_ok=True)
render(supermarket, os.path.join(OUT, "meena-bazar.png"))
render(restaurant, os.path.join(OUT, "sultans-dine.png"), width=720)
# A deliberately degraded scan: blurred, skewed and low-contrast, so the
# low-confidence and review paths can be demonstrated.
render(faint, os.path.join(OUT, "blurred.png"), width=640, blur=1.15, noise=True, rotate=1.4)
