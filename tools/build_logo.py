"""Build the Postmortem coin logo as clean, flat, single-colour SVGs.

Run: python3 tools/build_logo.py   (needs: pip install fonttools brotli)

Design: Zachary's pick from the Gemini sheet (#2, "Reeded edge, full legend ring"),
redrawn as vector. Brass is the fill; every dark part is a cut-out, so the coin sits
on any background and reads as one flat shape. The legend is outlined from Bodoni Moda
(SIL OFL), so the files need no font.

Outputs
  card/src/logo.svg              coin with the legend, used on the card back
  card/src/logo_plain.svg        same coin, no words
  assets/logo/postmortem-coin.svg, postmortem-coin-plain.svg, postmortem-coin-16.svg
"""
import math
import os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEGEND = 'POSTMORTEM · EVERY MATCH HAS A STORY · '
C = 100.0  # viewBox 0 0 200 200


def f(n):
    return ('%.2f' % n).rstrip('0').rstrip('.')


def circle(r, cx=C, cy=C):
    return f'M{f(cx - r)} {f(cy)}a{f(r)} {f(r)} 0 1 0 {f(2 * r)} 0a{f(r)} {f(r)} 0 1 0 {f(-2 * r)} 0Z'


def reeded(r_out, r_in, n):
    """Milled edge: n flat-topped reeds between r_in and r_out."""
    pts = []
    for i in range(n):
        a0 = i / n * 2 * math.pi
        step = 2 * math.pi / n
        for frac, r in ((0.0, r_in), (0.18, r_out), (0.62, r_out), (0.8, r_in)):
            a = a0 + frac * step
            pts.append((C + r * math.sin(a), C - r * math.cos(a)))
    return 'M' + 'L'.join(f'{f(x)} {f(y)}' for x, y in pts) + 'Z'


def eye(w, h, pupil):
    """Almond eye cut out of the field, with the brass pupil left standing."""
    x0, x1 = C - w / 2, C + w / 2
    d = f'M{f(x0)} {f(C)}Q{f(C)} {f(C - h)} {f(x1)} {f(C)}Q{f(C)} {f(C + h)} {f(x0)} {f(C)}Z'
    return d + circle(pupil)


def legend(font, text, size, r_base, centre_first=0):
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font['hmtx']
    s = size / font['head'].unitsPerEm
    names = [cmap[ord(ch)] for ch in text]
    adv = [hmtx[n][0] * s for n in names]
    total = sum(adv)
    circ = 2 * math.pi * r_base
    extra = (circ - total) / len(names)          # spread the slack evenly: one exact lap
    assert extra > -1.0, 'legend too long for the ring'
    out = ''
    # start so the first `centre_first` characters (POSTMORTEM) sit centred on the top
    lead = sum(adv[:centre_first]) + extra * (centre_first - 1)
    pos = -lead / 2
    for n, a in zip(names, adv):
        mid = pos + a / 2
        phi = mid / circ * 2 * math.pi             # clockwise from the top
        pos += a + extra
        if n in ('space',):
            continue
        cos, sin = math.cos(phi), math.sin(phi)
        # glyph space (x right, y up, origin at the glyph's left baseline) -> card space:
        # centre the advance on the ring, sit the baseline on r_base, then turn by phi.
        # local: X = x*s - a/2, Y = -(r_base + y*s)   (relative to the coin centre)
        # world: (C + X cos - Y sin, C + X sin + Y cos)
        xx, xy = s * cos, s * sin
        yx, yy = s * sin, -s * cos                  # dY/dy = -s
        dx = C + (-a / 2) * cos + r_base * sin
        dy = C + (-a / 2) * sin - r_base * cos
        pen = SVGPathPen(gs)
        gs[n].draw(TransformPen(pen, (xx, xy, yx, yy, dx, dy)))
        out += pen.getCommands()
    return out


BRASS = '#b08e4c'   # the card back's brass; the card copies use currentColor instead


def svg(d, title, size=200, fill=BRASS):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="{size}" height="{size}">'
            f'<title>{title}</title><path fill="{fill}" fill-rule="evenodd" d="{d}"/></svg>\n')


def main():
    font = TTFont(os.path.join(ROOT, 'assets/fonts/bodonimoda-var.woff2'))
    font = instancer.instantiateVariableFont(font, {'wght': 700, 'opsz': 11})

    edge = reeded(99.5, 97, 150)
    # brass rings and field, with the dark gaps cut between them
    rings = circle(93.4) + circle(91.4) + circle(66.4) + circle(64.6)
    words = legend(font, LEGEND, 14.4, 72.2, centre_first=len('POSTMORTEM'))
    the_eye = eye(96, 30, 11)
    full = edge + rings + words + the_eye

    # no words: a fine bead ring sits in the band instead, so it still reads as a coin
    beads = ''.join(circle(1.7, C + 78.5 * math.sin(i / 48 * 2 * math.pi), C - 78.5 * math.cos(i / 48 * 2 * math.pi)) for i in range(48))
    plain = edge + rings + beads + the_eye

    # 16 px: no reeds, no words, heavy rim, big eye
    tiny = circle(99) + circle(88) + circle(80) + eye(136, 44, 19)

    os.makedirs(os.path.join(ROOT, 'assets/logo'), exist_ok=True)
    files = {
        'card/src/logo.svg': svg(full, 'Postmortem coin', fill='currentColor'),
        'card/src/logo_plain.svg': svg(plain, 'Postmortem coin, no legend', fill='currentColor'),
        'assets/logo/postmortem-coin.svg': svg(full, 'Postmortem coin'),
        'assets/logo/postmortem-coin-plain.svg': svg(plain, 'Postmortem coin, no legend'),
        'assets/logo/postmortem-coin-16.svg': svg(tiny, 'Postmortem coin, small', 16),
    }
    for p, s in files.items():
        with open(os.path.join(ROOT, p), 'w') as fh:
            fh.write(s)
        print(p, len(s), 'bytes')


if __name__ == '__main__':
    main()
