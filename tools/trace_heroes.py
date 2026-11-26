"""Trace hero card renders into flat silhouettes for the Postmortem card.

Run: python3 tools/trace_heroes.py <folder with *_card_psd.png>
Needs: pip install potracer pillow numpy

Source: the game's own hero card renders (panorama/images/heroes/<name>_card_psd), exported
to Desktop\\Deadlock Mods\\Game Exports\\hero_cards. Each render's alpha becomes one solid
silhouette. Each hero keeps its eyes, or what covers them (Infernus's lenses, Abrams's
glasses, Seven's glowing grin), as cut-outs, so the hero still reads.

Each SVG carries data-frame="top cx hw band eye" in source pixels: the top of the head, the
centre of the face, the face width, the height of the head band and the eye line. card.js uses these to
fit every hero the same way: head fully inside the frame, face centred, shoulders cropped.
"""
import os
import sys
import numpy as np
import potrace
from PIL import Image, ImageDraw, ImageFilter

S = 4  # trace at 4x for smooth curves

# hero id -> (internal file name, eye parts). Every hero shows its eyes, or what covers them,
# as cut-outs: each part is (box x0 y0 x1 y1 in source px, colour test, opening size). The box
# keeps the test on the face; the opening (in 4x px) drops thin specks, 0 keeps fine lines.
dark = lambda lim: (lambda r, g, b: (r < lim) & (g < lim) & (b < lim + 20))
HEROES = {
    13: ('haze', [((0, 45, 280, 258), lambda r, g, b: (r > 170) & (g > 130) & (b < 140) & (r - b > 80), 13)]),
    # Lash: his scowling brow, the shape that reads as him (his eye is shut under it)
    31: ('lash', [(('fill', [(96, 135), (111, 111), (118, 114), (116, 123), (121, 118), (130, 125), (121, 129), (110, 134), (99, 139)]), None, 0)]),
    # Seven: two glowing eyes and the jagged grin under the hat brim, drawn from the render
    2: ('gigawatt', [(('fill', [(137, 199), (144, 196), (147, 204), (141, 207)]), None, 0),
                     (('fill', [(162, 195), (171, 193), (174, 201), (168, 207), (162, 203)]), None, 0),
                     (('fill', [(143, 220), (148, 215), (151, 219), (155, 214), (158, 219), (162, 213), (166, 222), (155, 225), (146, 225)]), None, 0)]),  # glowing grin under the hat
    # Abrams: the glasses, drawn as two frames from the render's corners, and his glowing eye
    6: ('bull', [(('ring', [(145, 148), (197, 165), (192, 195), (145, 188)], 3), None, 0),
                 (('ring', [(213, 173), (249, 180), (244, 212), (215, 208)], 3), None, 0),
                 ((150, 150, 172, 172), lambda r, g, b: (r > 190) & (g < 150) & (b < 100), 3)]),
    4: ('spectre', [(('fill', [(141, 158), (150, 152), (162, 151), (171, 155), (165, 161), (152, 163)]), None, 0),   # her lined eyes
                    (('fill', [(197, 166), (203, 162), (208, 164), (206, 171), (199, 172)]), None, 0)]),
    15: ('bebop', [((0, 45, 280, 258), lambda r, g, b: (g > 190) & (b > 140) & (r < 150), 7)]),
    27: ('yamato', [((138, 190, 198, 210), dark(85), 3)]),                      # slanted dark eyes
    # Mo & Krill: Krill's wide eyes (Mo's are under his cap)
    18: ('digger', [(('fill', [(45, 78), (52, 73), (61, 75), (59, 81), (50, 83)]), None, 0),
                    (('fill', [(78, 84), (85, 79), (94, 81), (93, 87), (84, 89)]), None, 0)]),
    # Infernus: his red glasses lenses, drawn from the render (the brim's glint shares their red)
    1: ('inferno', [(('fill', [(171, 158), (186, 160), (189, 169), (185, 178), (176, 182), (166, 179), (164, 167)]), None, 0),
                    (('fill', [(205, 169), (214, 171), (217, 179), (212, 185), (205, 184), (203, 176)]), None, 0)]),
}


def trace(mask, turd):
    bm = potrace.Bitmap(~mask)
    p = bm.trace(turdsize=turd, alphamax=1.1, opticurve=True, opttolerance=0.3)
    out = []
    for c in p:
        s = c.start_point
        d = f'M{s.x / S:.1f} {s.y / S:.1f}'
        for seg in c.segments:
            if seg.is_corner:
                d += f'L{seg.c.x / S:.1f} {seg.c.y / S:.1f}L{seg.end_point.x / S:.1f} {seg.end_point.y / S:.1f}'
            else:
                d += (f'C{seg.c1.x / S:.1f} {seg.c1.y / S:.1f} {seg.c2.x / S:.1f} {seg.c2.y / S:.1f} '
                      f'{seg.end_point.x / S:.1f} {seg.end_point.y / S:.1f}')
        out.append(d + 'Z')
    return ''.join(out)


def frame(alpha):
    """Head metrics in source pixels, ignoring thin spikes and stray sparkles."""
    m = alpha > 128
    rows = np.where(m.sum(1) >= 3)[0]
    top = int(rows[0])
    H = m.shape[0]
    band = int(H * 0.56)                         # head plus neck, in a bust crop
    a, b = top + int(band * .18), top + int(band * .72)
    ys, xs = np.nonzero(m[a:b])
    cx = float(xs.mean())
    lo, hi = np.percentile(xs, [8, 92])
    return top, cx, float(hi - lo), band


def main(src):
    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'card/src')
    for hid, (name, eye_parts) in HEROES.items():
        path = os.path.join(src, f'{name}_card_psd.png')
        if not os.path.exists(path):
            print('missing', path)
            continue
        im = Image.open(path).convert('RGBA')
        big = im.resize((im.width * S, im.height * S), Image.LANCZOS)
        alpha = big.split()[3].filter(ImageFilter.GaussianBlur(3))
        mask = np.array(alpha) > 128
        sil = trace(mask, 6000)                  # turdsize drops sparkles and specks
        r, g, b, _ = [np.array(c).astype(int) for c in big.split()]
        e = np.zeros(mask.shape, bool)
        for box, test, op in eye_parts:
            if box[0] in ('ring', 'fill'):   # a drawn shape (glasses), points in source px
                im_r = Image.new('L', mask.shape[::-1], 0)
                pts = [(x * S, y * S) for x, y in box[1]]
                if box[0] == 'fill':
                    ImageDraw.Draw(im_r).polygon(pts, fill=255)
                else:
                    ImageDraw.Draw(im_r).line(pts + pts[:1], fill=255, width=box[2] * S, joint='curve')
                e |= (np.array(im_r) > 0) & mask
                continue
            x0, y0, x1, y1 = box
            part = np.zeros(mask.shape, bool)
            part[y0 * S:y1 * S, x0 * S:x1 * S] = True
            part &= test(r, g, b) & mask
            if op:   # open the mask: drops thin glints (Haze's forehead mark), keeps the eyes
                part = np.array(Image.fromarray((part * 255).astype('uint8')).filter(ImageFilter.MinFilter(op)).filter(ImageFilter.MaxFilter(op))) > 0
            e |= part
        e = np.array(Image.fromarray((e * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(2))) > 100
        eyes = trace(e, 30) if e.any() else ''
        top, cx, hw, band = frame(np.array(im.split()[3]))
        ey = np.nonzero(e)[0]
        eye_y = float(ey.mean() / S) if len(ey) else top + band * 0.55   # the eye line, source px
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {im.width} {im.height}" '
               f'data-frame="{top} {cx:.1f} {hw:.1f} {band} {eye_y:.1f}">'
               f'<path fill-rule="evenodd" d="{sil}"/>' + (f'<path fill="#e9dcc3" d="{eyes}"/>' if eyes else '') + '</svg>')
        with open(os.path.join(out_dir, f'hero_{hid}.svg'), 'w') as fh:
            fh.write(svg)
        print(hid, name, 'frame', top, round(cx, 1), round(hw, 1), band, round(eye_y, 1), len(sil), len(eyes))


if __name__ == '__main__':
    main(sys.argv[1])
