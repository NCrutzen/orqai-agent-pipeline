#!/usr/bin/env python3
"""Agent Workforce Update one-pager — Moyne Roberts house style (white / navy / orange / blue).

White background, navy headings, orange accent, blue wave motif. Reuses workforce
persona avatars. Matrix ("What's switched on, per mailbox") with 4 states.
Usage: python3 render_onepager.py <content.json> <out_dir> [logo.png]
"""
import json, sys, html, base64
from pathlib import Path
import cairosvg

NAVY     = "#14253B"
INK      = NAVY
CHAR     = "#46526A"
MUTED    = "#6B7589"
ORANGE   = "#E8531A"
ORANGE_D = "#C0420F"
BLUE     = "#1668C7"
BLUE_D   = "#0F4E96"
LIVE     = "#1668C7"
SHADOW   = "#E8531A"
SLATE    = "#5B6B8C"
GREY     = "#9AA3B2"
PAPER    = "#FFFFFF"
HAIR     = "#E2E6EE"
WHITE    = "#FFFFFF"
FONT     = "Lato, 'DejaVu Sans', Helvetica, Arial, sans-serif"

W, H = 794, 1123
MX = 54
WF = Path(__file__).resolve().parents[1]
AV = WF / "assets" / "avatars"

def esc(s): return html.escape(str(s), quote=True)

def text(x, y, s, size=14, color=INK, weight=400, anchor="start", spacing=0, italic=False):
    ls = f' letter-spacing="{spacing}"' if spacing else ""
    it = ' font-style="italic"' if italic else ""
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" '
            f'fill="{color}" font-weight="{weight}" text-anchor="{anchor}"{ls}{it}>{esc(s)}</text>')

def wrap(s, mc):
    words, lines, cur = s.split(), [], ""
    for w in words:
        if len(cur)+len(w)+1 <= mc: cur = (cur+" "+w).strip()
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def multiline(x, y, s, size, color, mc, lh, weight=400):
    lines = wrap(s, mc)
    return "".join(text(x, y+i*lh, ln, size, color, weight) for i, ln in enumerate(lines)), y+len(lines)*lh

def rect(x, y, w, h, fill, r=0, stroke=None, sw=1):
    st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    rr = f' rx="{r}" ry="{r}"' if r else ""
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}"{rr} fill="{fill}"{st}/>'

def hline(x, y, w, color=HAIR, sw=1):
    return f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{x+w:.1f}" y2="{y:.1f}" stroke="{color}" stroke-width="{sw}"/>'

def vline(x, y, h, color=HAIR, sw=1):
    return f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{x:.1f}" y2="{y+h:.1f}" stroke="{color}" stroke-width="{sw}"/>'

def b64(p): return base64.b64encode(Path(p).read_bytes()).decode()

def avatar(cx, cy, r, fname):
    p = AV / fname
    if not p.exists(): return ""
    return (f'<clipPath id="cl{fname}"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath>'
            f'<circle cx="{cx}" cy="{cy}" r="{r+1.5}" fill="{WHITE}" stroke="{HAIR}" stroke-width="1"/>'
            f'<image x="{cx-r}" y="{cy-r}" width="{2*r}" height="{2*r}" '
            f'clip-path="url(#cl{fname})" xlink:href="data:image/png;base64,{b64(p)}"/>')

def build(data, logo_b64=None, logo_ratio=6.0):
    CW = W - 2*MX
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    s.append(rect(0, 0, W, H, PAPER))
    s.append(rect(0, 0, W, 6, ORANGE))

    # header
    if logo_b64:
        lw = 196; lh = lw/logo_ratio
        s.append(f'<image x="{MX}" y="44" width="{lw}" height="{lh:.1f}" xlink:href="data:image/png;base64,{logo_b64}"/>')
    s.append(text(W-MX, 58, data["title"].upper(), 10.5, MUTED, 700, anchor="end", spacing=2.5))
    s.append(text(W-MX, 76, f'{data["period_label"]} · {data["date_human"]}', 12, ORANGE_D, 800, anchor="end"))
    wave = WF/"assets"/"wave.png"
    if wave.exists():
        s.append(f'<image x="0" y="92" width="{W}" height="30" preserveAspectRatio="none" xlink:href="data:image/png;base64,{b64(wave)}"/>')

    # headline + standfirst
    y = 156
    for i, ln in enumerate(wrap(data["tagline"], 34)):
        s.append(text(MX, y+i*36, ln, 31, NAVY, 900))
    y += 36*len(wrap(data["tagline"], 34)) + 8
    block, y = multiline(MX, y, data["intro"], 12.5, CHAR, 92, 18)
    s.append(block); y += 22

    # pipeline strip with avatars
    pp = data["pipeline"]["steps"]; pn = len(pp); pcw = CW/pn
    s.append(text(MX, y, data["pipeline"]["title"].upper(), 10, ORANGE_D, 800, spacing=1.5))
    py = y + 36
    for i in range(pn-1):
        x1 = MX + i*pcw + pcw/2; x2 = MX + (i+1)*pcw + pcw/2
        if i == pn-2:
            s.append(f'<line x1="{x1:.1f}" y1="{py}" x2="{x2:.1f}" y2="{py}" stroke="{GREY}" stroke-width="1.5" stroke-dasharray="3 4"/>')
        else:
            s.append(hline(x1, py, x2-x1, BLUE, 1.5))
    for i, st in enumerate(pp):
        cx = MX + i*pcw + pcw/2
        s.append(avatar(cx, py, 20, st.get("avatar", "")))
        s.append(text(cx, py+38, st["persona"], 10.5, NAVY, 800, anchor="middle"))
        s.append(text(cx, py+50, st["persona_title"], 8.3, BLUE_D, 400, anchor="middle", italic=True))
        s.append(text(cx, py+63, st["title"], 8, MUTED, 700, anchor="middle"))
        if i == pn-1:
            s.append(text(cx, py+74, "NOT YET", 7, GREY, 800, anchor="middle", spacing=0.8))
    y = py + 80
    s.append(hline(MX, y, CW, HAIR, 1)); y += 26

    # hero stats
    n = 4; colw = CW/n
    for i, st in enumerate(data["hero_stats"]):
        cx = MX + i*colw
        if i: s.append(vline(cx, y+10, 76, HAIR, 1))
        s.append(text(cx+16, y+50, st["value"], 36, NAVY, 900))
        s.append(text(cx+16, y+72, st["label"].upper(), 10, ORANGE_D, 800, spacing=0.6))
        s.append(text(cx+16, y+88, st["sub"], 9.5, MUTED, 400))
    y += 98
    s.append(hline(MX, y, CW, HAIR, 1)); y += 30

    # matrix: what's switched on, per mailbox
    mx = data["matrix"]
    s.append(text(MX, y, mx["title"], 16, NAVY, 800))
    s.append(text(W-MX, y, "Active funnel stage per mailbox", 9, MUTED, 400, anchor="end"))
    y += 16
    state_col = {"live": BLUE, "dry": ORANGE, "shadow": SLATE, "off": GREY}
    lgx = MX
    for it in mx["legend"]:
        s.append(f'<circle cx="{lgx+4:.1f}" cy="{y-3}" r="3.5" fill="{state_col[it["key"]]}"/>')
        s.append(text(lgx+13, y, it["label"], 8.5, MUTED, 600))
        lgx += 13 + len(it["label"])*4.7 + 20
    y += 12
    cols_short = mx.get("short_columns", mx["columns"])
    ncol = len(cols_short); mbw = 178; capw = (CW-mbw)/ncol
    hh = 20
    s.append(rect(MX, y, CW, hh, NAVY, 0))
    s.append(text(MX+8, y+14, "Mailbox", 9, WHITE, 700))
    for j, c in enumerate(cols_short):
        s.append(text(MX+mbw+j*capw+capw/2, y+14, c, 8.3, WHITE, 700, anchor="middle"))
    y += hh
    rows = mx["rows"]; rh2 = 15 if len(rows) > 11 else 16.5
    glyph = {"live": "✓", "dry": "◐", "shadow": "○", "off": "–"}
    fillc = {"live": BLUE, "dry": ORANGE, "shadow": SLATE, "off": "#EEF1F7"}
    txtc = {"live": WHITE, "dry": WHITE, "shadow": WHITE, "off": GREY}
    for ri, row in enumerate(rows):
        ry = y + ri*rh2
        if ri % 2 == 0:
            s.append(rect(MX, ry, CW, rh2, "#F5F7FB"))
        s.append(text(MX+8, ry+rh2*0.7, row["mailbox"], 8.4, NAVY, 600))
        for j, cell in enumerate(row["cells"]):
            cx0 = MX+mbw+j*capw
            s.append(rect(cx0+2, ry+2, capw-4, rh2-4, fillc[cell], 2))
            s.append(f'<text x="{cx0+capw/2:.1f}" y="{ry+rh2*0.72}" font-family="DejaVu Sans, sans-serif" '
                     f'font-size="8.5" fill="{txtc[cell]}" font-weight="700" text-anchor="middle">{glyph[cell]}</text>')
    y += len(rows)*rh2 + 6
    nlines = wrap(mx["note"], 150)
    for i, ln in enumerate(nlines):
        s.append(text(MX, y+8+i*10, ln, 7.6, MUTED, 400, italic=True))
    y += 8 + len(nlines)*10 + 18

    # what's new (2x2)
    s.append(text(MX, y, "What's new", 16, NAVY, 800)); y += 20
    items = data["shipped"][:4]; g = 30; iw = (CW-g)/2; ih = 54
    for i, it in enumerate(items):
        col, row = i % 2, i//2
        bx, by = MX+col*(iw+g), y+row*(ih+8)
        s.append(text(bx, by+13, "✓", 12, BLUE, 900))
        s.append(text(bx+20, by+13, it["title"], 12, NAVY, 800))
        bl, _ = multiline(bx+20, by+30, it["body"], 11, MUTED, 48, 13)
        s.append(bl)
    y += 2*ih + 8 + 20

    # footer
    s.append(hline(MX, H-50, CW, HAIR, 1))
    s.append(text(MX, H-30, data.get("brand_line", ""), 10.5, NAVY, 700))
    s.append(text(W-MX, H-30, data.get("shadow_note", ""), 9.5, ORANGE_D, 700, anchor="end"))
    s.append('</svg>')
    return "".join(s)

def main():
    src = Path(sys.argv[1]); out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
    logo_path = Path(sys.argv[3]) if len(sys.argv) > 3 else WF.parents[2]/"public/brand/moyne-roberts-logo.png"
    logo_b64, ratio = None, 6.0
    if logo_path.exists():
        logo_b64 = base64.b64encode(logo_path.read_bytes()).decode()
        try:
            from PIL import Image
            iw, ih = Image.open(logo_path).size; ratio = iw/ih
        except Exception:
            pass
    data = json.loads(src.read_text())
    svg = build(data, logo_b64, ratio)
    stem = src.stem
    (out/f"{stem}.svg").write_text(svg)
    cairosvg.svg2pdf(bytestring=svg.encode(), write_to=str(out/f"{stem}.pdf"))
    cairosvg.svg2png(bytestring=svg.encode(), write_to=str(out/f"{stem}.png"), scale=2.0)
    print("wrote", out/f"{stem}.pdf")

if __name__ == "__main__":
    main()
