"""Genera le immagini delle inserzioni Meta (1080x1080 feed e 1080x1920 storie/reel)
a partire da campagna-demo-risparmio.json e dai mockup del totem.

Uso:  python -I marketing/meta/genera_creativita.py
Output: marketing/meta/creativita/<file>-1080x1080.png e <file>-1080x1920.png

Stile: dark dashboard dell'app (sfondo #0f1117, testo #e8eaf2, grigio #9ba3c0, accento #3b82f6).
Testo tenuto sotto il 20% dell'area, zone sicure delle storie rispettate (250 px sopra, 340 px sotto).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
SPEC = HERE / "campagna-demo-risparmio.json"
OUT = HERE / "creativita"
# Mockup del totem: prodotti da smartera/outreach-rsmioni/make_img.py (640x1500, sfondo trasparente)
TOTEM_DIR = Path(os.environ.get("RSMIONI_TOTEM_DIR", HERE.parents[2] / "smartera" / "outreach-rsmioni" / "img"))
FONTS = Path(r"C:\Windows\Fonts")

BG = (15, 17, 23)
FG = (232, 234, 242)
MUTED = (155, 163, 192)
ACCENT = (59, 130, 246)
LINE = (46, 51, 72)


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    path = FONTS / name
    if not path.exists():  # fallback se manca Segoe UI
        return ImageFont.load_default(size=size)
    return ImageFont.truetype(str(path), size)


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    """Va a capo per parola; conserva gli a-capo espliciti."""
    lines: list[str] = []
    for par in text.split("\n"):
        cur = ""
        for word in par.split(" "):
            test = (cur + " " + word).strip()
            if draw.textlength(test, font=fnt) <= max_w or not cur:
                cur = test
            else:
                lines.append(cur)
                cur = word
        lines.append(cur)
    return lines


def draw_lines(draw, lines, x, y, fnt, fill, leading) -> int:
    for ln in lines:
        draw.text((x, y), ln, font=fnt, fill=fill)
        y += leading
    return y


def background(w: int, h: int) -> Image.Image:
    im = Image.new("RGB", (w, h), BG)
    glow = Image.new("RGB", (w, h), BG)
    g = ImageDraw.Draw(glow)
    r = int(w * 0.42)
    g.ellipse((-r // 2, int(h * 0.12), -r // 2 + r, int(h * 0.12) + r), fill=(30, 58, 138))
    g.ellipse((w - r // 2, h - r, w + r // 2, h), fill=(20, 83, 45))
    glow = glow.filter(ImageFilter.GaussianBlur(w // 7))
    return Image.blend(im, glow, 0.55)


def pill(draw, x, y, text, fnt) -> int:
    tw = draw.textlength(text, font=fnt)
    pad_x, pad_y = 26, 14
    box = (x, y, x + tw + 2 * pad_x, y + fnt.size + 2 * pad_y)
    draw.rounded_rectangle(box, radius=(box[3] - box[1]) // 2, fill=(59, 130, 246, 46), outline=ACCENT, width=3)
    draw.text((x + pad_x, y + pad_y - 2), text, font=fnt, fill=FG)
    return box[3]


def brand(draw, x, y, w, size: int):
    fb = font("segoeuib.ttf", size)
    fr = font("segoeui.ttf", size)
    draw.ellipse((x, y + size * 0.3, x + size * 0.5, y + size * 0.8), fill=(34, 197, 94))
    draw.text((x + size * 0.8, y), "RS Mioni", font=fb, fill=FG)
    off = x + size * 0.8 + draw.textlength("RS Mioni", font=fb) + size * 0.5
    draw.text((off, y), "· reception a distanza per hotel e strutture ricettive", font=fr, fill=MUTED)
    tw = draw.textlength("rsmioni.it", font=fb)
    draw.text((x + w - tw, y), "rsmioni.it", font=fb, fill=MUTED)


def totem(name: str) -> Image.Image:
    path = TOTEM_DIR / name
    if not path.exists():
        sys.exit(f"Manca il mockup del totem: {path} (genera con smartera/outreach-rsmioni/make_img.py o imposta RSMIONI_TOTEM_DIR)")
    return Image.open(path).convert("RGBA")


def feed_1080(spec: dict) -> Image.Image:
    w = h = 1080
    im = background(w, h).convert("RGBA")
    # Totem a destra, alto quanto l'immagine
    t = totem(spec["totem"])
    th = int(h * 0.98)
    t = t.resize((int(t.width * th / t.height), th), Image.LANCZOS)
    im.alpha_composite(t, (w - t.width + 40, h - th + 10))

    draw = ImageDraw.Draw(im, "RGBA")
    margin = 64
    text_w = w - t.width - margin - 20
    y = 96
    y = pill(draw, margin, y, spec["pill"], font("segoeuib.ttf", 30)) + 56
    fh = font("segoeuil.ttf", 66)
    lines = wrap(draw, spec["headline"], fh, text_w)
    if len(lines) > 4:
        fh = font("segoeuil.ttf", 58)
        lines = wrap(draw, spec["headline"], fh, text_w)
    y = draw_lines(draw, lines, margin, y, fh, FG, int(fh.size * 1.12)) + 30
    draw.line((margin, y, margin + 90, y), fill=ACCENT, width=5)
    y += 36
    fs = font("segoeui.ttf", 32)
    draw_lines(draw, wrap(draw, spec["sub"], fs, text_w), margin, y, fs, MUTED, 44)
    brand(draw, margin, h - 86, w - 2 * margin, 26)
    return im.convert("RGB")


def story_1080x1920(spec: dict) -> Image.Image:
    w, h = 1080, 1920
    im = background(w, h).convert("RGBA")
    draw = ImageDraw.Draw(im, "RGBA")
    margin = 72
    text_w = w - 2 * margin
    y = 290  # zona sicura superiore
    y = pill(draw, margin, y, spec["pill"], font("segoeuib.ttf", 34)) + 54
    fh = font("segoeuil.ttf", 78)
    lines = wrap(draw, spec["headline"], fh, text_w)
    y = draw_lines(draw, lines, margin, y, fh, FG, int(fh.size * 1.1)) + 28
    draw.line((margin, y, margin + 100, y), fill=ACCENT, width=6)
    y += 36
    fs = font("segoeui.ttf", 38)
    y = draw_lines(draw, wrap(draw, spec["sub"], fs, text_w), margin, y, fs, MUTED, 52) + 34
    brand(draw, margin, y, w - 2 * margin, 28)
    # Totem sotto il testo, fino in fondo (la base finisce nella zona sicura inferiore: è solo decorativa)
    t = totem(spec["totem"])
    th = min(1120, h - (y + 90))
    t = t.resize((int(t.width * th / t.height), th), Image.LANCZOS)
    im.alpha_composite(t, ((w - t.width) // 2, h - th + 40))
    return im.convert("RGB")


def main() -> None:
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    OUT.mkdir(exist_ok=True)
    for code, ad in spec["inserzioni"].items():
        img = ad["immagine"]
        feed_1080(img).save(OUT / f"{img['file']}-1080x1080.png", optimize=True)
        story_1080x1920(img).save(OUT / f"{img['file']}-1080x1920.png", optimize=True)
        print(f"{code}: {img['file']}-1080x1080.png, {img['file']}-1080x1920.png")
    print(f"Creatività in {OUT}")


if __name__ == "__main__":
    main()
