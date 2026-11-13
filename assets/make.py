"""Draws the README images from the same colors and strings the band uses.

    python3 assets/make.py

Writes band-*.svg, states-*.svg and desktop-*.svg next to this file, one per theme.
Text is laid on a fixed cell grid (textLength), so columns line up in any monospace font.
"""

from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).parent

# cadence/hooks/visual.ts
STROKE = {"ok": "#2e9e63", "warn": "#bd7f00", "crit": "#e0483e", "info": "#2f86d6", "hi": "#7b6be6", "neutral": "#8a8984"}
TRACK = "#3f3f46"  # TRILHO: the unfilled part of every bar, in both themes

# Approximations of Claude Code's theme keys on its two backgrounds.
THEMES = {
    "dark": dict(bg="#1f1e1d", frame="#3a3937", fg="#e8e6e3", dim="#8a8984", ok="#4eba65", warn="#e8a33d",
                 crit="#f0707e", info="#9aa5f7", hi="#b1b9f9", label="#a3a19c"),
    "light": dict(bg="#faf9f5", frame="#dedcd4", fg="#1f1e1d", dim="#6b6a66", ok="#2c7a39", warn="#966c1e",
                  crit="#ab2b3f", info="#4a5ee8", hi="#5769f7", label="#6b6a66"),
}

CW, LH, FS = 8.4, 22, 14
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'DejaVu Sans Mono', monospace"
SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
COLS = 112
PAD = 22
GAP = "    "  # gap={4} between segments


def level_ctx(pct):  # nivelPct(pct, min(70, heavyPct - 10), heavyPct)
    return "crit" if pct >= 85 else "warn" if pct >= 70 else "ok"


def level_limit(pct):  # nivelPct(pct, 70, 90)
    return "crit" if pct >= 90 else "warn" if pct >= 70 else "ok"


def thin(pct, width, level):
    """barraFina: a nonzero value always shows one cell, zero shows none."""
    full = min(width, max(1 if pct > 0 else 0, int(pct * width // 100)))
    return ("\0" * width, ("bar", full, STROKE[level]))


class Term:
    """A tiny cell-grid renderer: segments are (text, color, bg, bold)."""

    def __init__(self, t):
        self.t = t
        self.out = []

    def color(self, c):
        return self.t.get(c, c)

    def put(self, row_y, col, text, color="fg", bg=None, bold=False):
        if isinstance(color, tuple):  # a thin bar: heavy line centered in the cell
            _, full, stroke = color
            x0 = PAD + col * CW
            mid = row_y - 5
            if full:
                self.out.append(f'<rect x="{x0:.1f}" y="{mid - 1.5}" width="{full * CW:.1f}" height="3" fill="{stroke}"/>')
            rest = len(text) - full
            if rest:
                self.out.append(f'<rect x="{x0 + full * CW:.1f}" y="{mid - 1.5}" width="{rest * CW:.1f}" height="3" fill="{TRACK}"/>')
            return col + len(text)
        x = PAD + col * CW
        w = len(text) * CW
        if text.strip():
            weight = ' font-weight="700"' if bold else ""
            self.out.append(
                f'<text x="{x:.1f}" y="{row_y}" textLength="{w:.1f}" lengthAdjust="spacingAndGlyphs" '
                f'fill="{self.color(color)}"{weight} xml:space="preserve">{escape(text)}</text>'
            )
        return col + len(text)

    def line(self, y, left, right=()):
        col = 0
        for seg in left:
            col = self.put(y, col, *seg)
        width = sum(len(s[0]) for s in right) + max(0, len(right) - 1)
        col = COLS - width
        for seg in right:
            col = self.put(y, col, *seg) + 1


def band(ctx, used, five, reset, week, effort, compacts=None, alert=None):
    """Line 1 as register.tsx draws it, plus the optional warning line."""
    lc = level_ctx(ctx)
    segs = [("ctx ", "dim"), thin(ctx, 10, lc),
            (f" {ctx}%", "fg" if lc == "ok" else lc, None, ctx >= 85), (f" {used}/350k", "dim")]
    lf = level_limit(five)
    segs += [(GAP, "dim"), ("5h ", "dim"), thin(five, 8, lf), (f" {five}%", lf), (f" ↻ {reset}", "dim")]
    segs += [(GAP, "dim"), ("7d ", "dim"), (f"{week}%", level_limit(week))]
    segs += [(GAP, "dim")]
    if compacts:
        segs += [(f"compacts in {compacts} min   ", "info")]
    segs += [effort]
    lines = [(segs, ())]
    if alert:
        lvl, key, rest, buttons = alert
        l2 = [("│ ", lvl), (key, "fg", None, True), (rest, "fg")]
        r2 = [(f"[ {b} ]", "fg", None, i == 0) for i, b in enumerate(buttons)] + [("✕", "dim")]
        lines.append((l2, r2))
    return lines


def frame(t, h, body, w=None):
    w = w or PAD * 2 + COLS * CW
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{h}" viewBox="0 0 {w:.0f} {h}" '
        f'font-family="{MONO}" font-size="{FS}">'
        f'<rect x="0.5" y="0.5" width="{w - 1:.0f}" height="{h - 1}" rx="12" fill="{t["bg"]}" stroke="{t["frame"]}"/>'
        f"{body}</svg>\n"
    )


def hero(name, t):
    g = Term(t)
    y = 40
    g.line(y, [("> ", "dim"), ("add rate limiting to the upload endpoint", "fg")])
    y += LH * 1.5
    g.line(y, [("⏺ ", "ok"), ("Added a token bucket in middleware/ratelimit.go and wired it into /upload.", "fg")])
    y += LH
    g.line(y, [("  ", "fg"), ("Tests pass (14). The billing refactor you mentioned is unrelated to this.", "dim")])
    y += LH * 2
    g.out.append(f'<line x1="{PAD}" x2="{PAD + COLS * CW:.0f}" y1="{y - 24}" y2="{y - 24}" stroke="{t["frame"]}"/>')
    for left, right in band(
        44, "154k", 25, "3h51m", 7, ("◑ high", "warn"), compacts=12,
        alert=("hi", "A new chat would do better: ", "upload is done; billing starts fresh", ["New chat", "Compact"]),
    ):
        g.line(y, left, right)
        y += LH
    (OUT / f"band-{name}.svg").write_text(frame(t, int(y + 4), "".join(g.out)))


def states(name, t):
    g = Term(t)
    y = 34
    cases = [
        ("The judge picks an effort for each prompt", band(
            22, "77k", 25, "3h51m", 7, ("◐ deciding…", "hi"))),
        ("The cache went cold: the next message pays full price", band(
            51, "180k", 40, "2h10m", 12, ("◑ high", "warn"),
            alert=("info", "Cache cold: ", "the next message rereads 180k at full price", ["Compact", "New chat"]))),
        ("Heavy context: every message rereads everything", band(
            88, "308k", 66, "1h05m", 31, ("● max", "crit", None, True),
            alert=("crit", "Heavy context: ", "every message rereads 308k", ["Compact", "New chat"]))),
        ("Close to the limit, with saver mode capping effort at medium", band(
            34, "119k", 92, "38m", 74, ("◔ medium · saver", "fg"),
            alert=("crit", "5h limit at 92%", " · resets at 14:20 · saver on", ["Turn saver off"]))),
    ]
    for caption, lines in cases:
        g.out.append(f'<text x="{PAD}" y="{y}" font-family="{SANS}" font-size="13" fill="{t["label"]}">{escape(caption)}</text>')
        y += LH + 6
        for left, right in lines:
            g.line(y, left, right)
            y += LH
        y += 22
    (OUT / f"states-{name}.svg").write_text(frame(t, int(y - 6), "".join(g.out)))


def ring(cx, cy, r, sw, frac, color, dashed=False):
    import math
    c = 2 * math.pi * r
    track = f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{STROKE["neutral"]}" stroke-opacity="0.35" stroke-width="{sw}"/>'
    if dashed:
        return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-dasharray="2 3"/>'
    return track + (
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" '
        f'stroke-dasharray="{c * frac:.2f} {c:.2f}" transform="rotate(-90 {cx} {cy})"/>'
    )


def desktop(name, t):
    W, H = 760, 108
    s = []
    T = lambda x, y, txt, fill, size=13, weight=400, anchor="start": s.append(
        f'<text x="{x}" y="{y}" font-family="{SANS}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
        f'text-anchor="{anchor}">{escape(txt)}</text>')
    y = 36
    s.append(ring(32, y - 5, 9, 3, 0.44, STROKE["ok"]))
    T(50, y, "44%", t["fg"], 14, 600)
    T(84, y, "154k / 350k", t["dim"], 12)
    s.append(f'<rect x="164" y="{y - 17}" width="112" height="24" rx="12" fill="none" stroke="{t["warn"]}"/>')
    T(220, y - 1, "◑ High effort", t["warn"], 12, 500, "middle")
    s.append(ring(298, y - 5, 8, 2.5, 0.7, STROKE["ok"]))
    T(312, y, "cache 42 min", t["dim"], 12)
    T(W - 250, y, "compacts in 12 min", t["info"], 12)
    T(W - 112, y, "5h", t["dim"], 12)
    s.append(f'<rect x="{W - 94}" y="{y - 8}" width="56" height="6" rx="3" fill="{STROKE["neutral"]}" fill-opacity="0.35"/>')
    s.append(f'<rect x="{W - 94}" y="{y - 8}" width="{56 * 0.62:.1f}" height="6" rx="3" fill="{STROKE["ok"]}"/>')
    T(W - 32, y, "62%", t["fg"], 12, 500)
    y2 = 60
    s.append(f'<rect x="16" y="{y2}" width="{W - 32}" height="34" rx="10" fill="none" stroke="{t["hi"]}"/>')
    T(32, y2 + 22, "●", t["hi"], 12)
    s.append(f'<text x="50" y="{y2 + 22}" font-family="{SANS}" font-size="13" fill="{t["fg"]}">'
             f'<tspan font-weight="600">A new chat would do better:</tspan> upload is done; billing starts fresh</text>')
    for x, label, primary in ((W - 266, "New chat", True), (W - 180, "Compact", False)):
        fill = t["hi"] if primary else "none"
        txt = t["bg"] if primary else t["fg"]
        s.append(f'<rect x="{x}" y="{y2 + 6}" width="78" height="22" rx="6" fill="{fill}" stroke="{t["hi"] if primary else t["frame"]}"/>')
        T(x + 39, y2 + 21, label, txt, 12, 500, "middle")
    T(W - 30, y2 + 21, "Dismiss", t["dim"], 12, 400, "end")
    (OUT / f"desktop-{name}.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
        f'<rect x="0.5" y="0.5" width="{W - 1}" height="{H - 1}" rx="12" fill="{t["bg"]}" stroke="{t["frame"]}"/>'
        + "".join(s) + "</svg>\n")


for name, t in THEMES.items():
    hero(name, t)
    states(name, t)
    desktop(name, t)
print("ok")
