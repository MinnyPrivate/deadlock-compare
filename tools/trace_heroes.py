"""Trace hero card renders into flat silhouettes for the Postmortem card.

Run: python3 tools/trace_heroes.py <folder with *_card_psd.png>
Needs: pip install potracer pillow numpy

Source: the game's own hero card renders (panorama/images/heroes/<name>_card_psd), exported
to Desktop\\Deadlock Mods\\Game Exports\\hero_cards. Each render's alpha becomes one solid
silhouette. Glowing eyes (Haze, Bebop) are kept as cut-outs, so the hero still reads.

Each SVG carries data-frame="top cx hw band" in source pixels: the top of the head, the
centre of the face, the face width and the height of the head band. card.js uses these to
fit every hero the same way: head fully inside the frame, face centred, shoulders cropped.
"""
import os
import sys
import numpy as np
import potrace
from PIL import Image, ImageFilter

S = 4  # trace at 4x for smooth curves

# hero id -> (internal file name, eye colour test or None)
HEROES = {
    13: ('haze', lambda r, g, b: (r > 170) & (g > 130) & (b < 140) & (r - b > 80)),
    31: ('lash', None),
    2: ('gigawatt', None),
    6: ('bull', None),
    4: ('spectre', None),
    15: ('bebop', lambda r, g, b: (g > 190) & (b > 140) & (r < 150)),
    27: ('yamato', None),
    18: ('digger', None),
    1: ('inferno', None),
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
    for hid, (name, eye_test) in HEROES.items():
        path = os.path.join(src, f'{name}_card_psd.png')
        if not os.path.exists(path):
            print('missing', path)
            continue
        im = Image.open(path).convert('RGBA')
        big = im.resize((im.width * S, im.height * S), Image.LANCZOS)
        alpha = big.split()[3].filter(ImageFilter.GaussianBlur(3))
        mask = np.array(alpha) > 128
        sil = trace(mask, 6000)                  # turdsize drops sparkles and specks
        eyes = ''
        if eye_test:
            r, g, b, _ = [np.array(c).astype(int) for c in big.split()]
            e = eye_test(r, g, b) & mask
            Hh = e.shape[0]
            e[:int(Hh * 0.12), :] = False         # eyes sit in the face, not on the hair or chest
            e[int(Hh * 0.68):, :] = False
            # open the mask first: drops thin glints (Haze's forehead mark) and keeps the eyes
            e = Image.fromarray((e * 255).astype('uint8')).filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7))
            e = np.array(e.filter(ImageFilter.GaussianBlur(2))) > 100
            eyes = trace(e, 40)
        top, cx, hw, band = frame(np.array(im.split()[3]))
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {im.width} {im.height}" '
               f'data-frame="{top} {cx:.1f} {hw:.1f} {band}">'
               f'<path fill-rule="evenodd" d="{sil}"/>' + (f'<path fill="#e9dcc3" d="{eyes}"/>' if eyes else '') + '</svg>')
        with open(os.path.join(out_dir, f'hero_{hid}.svg'), 'w') as fh:
            fh.write(svg)
        print(hid, name, 'frame', top, round(cx, 1), round(hw, 1), band, len(sil), len(eyes))


if __name__ == '__main__':
    main(sys.argv[1])
